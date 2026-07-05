document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".notice").forEach(function (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // --- auto-save display name on blur ---
  // Uses sendBeacon instead of fetch: blur fires right before a click
  // navigates away (e.g. opening a file), and a plain fetch() gets
  // cancelled mid-flight when the page unloads, so the name cookie would
  // silently never get set. sendBeacon is guaranteed to be delivered even
  // across a navigation.
  var nameInput = document.getElementById("display-name-input");
  if (nameInput) {
    var lastSaved = nameInput.value;
    nameInput.addEventListener("blur", function () {
      var val = nameInput.value.trim();
      if (!val || val === lastSaved) return;
      var body = new FormData();
      body.append("display_name", val);
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/set_name", body);
      } else {
        fetch("/set_name", { method: "POST", body: body });
      }
      lastSaved = val;
    });
  }

  // --- import file: auto-submit as soon as a file is picked ---
  var importInput = document.getElementById("import-file-input");
  if (importInput) {
    importInput.addEventListener("change", function () {
      if (importInput.files.length) importInput.form.submit();
    });
  }

  function reportNetworkError(err) {
    console.error(err);
    alert("Network error - please check your connection and try again.");
  }

  // --- vessel file list: single click selects, double click opens ---
  var detailPane = document.getElementById("detail-pane");
  var cards = document.querySelectorAll(".file-card[data-filename]");

  function refreshPanel(filename) {
    return fetch("/panel/" + encodeURIComponent(filename))
      .then(function (r) { return r.text(); })
      .then(function (html) {
        detailPane.innerHTML = html;
        detailPane.dataset.filename = filename;
      });
  }

  function updateCardIssueCount(filename) {
    var countEl = detailPane.querySelector('[data-toggle="issues"] .detail-count');
    if (!countEl) return;
    var count = parseInt(countEl.textContent, 10) || 0;
    var card = document.querySelector('.file-card[data-filename="' + CSS.escape(filename) + '"]');
    if (!card) return;
    var tag = card.querySelector(".file-tag");
    if (!tag) return;
    if (count > 0) {
      tag.className = "file-tag issues";
      tag.textContent = count + (count === 1 ? " issue" : " issues");
    } else {
      tag.className = "file-tag clean";
      tag.textContent = "No issues";
    }
  }

  function selectCard(card) {
    cards.forEach(function (c) { c.classList.remove("selected"); });
    card.classList.add("selected");
    refreshPanel(card.getAttribute("data-filename")).catch(reportNetworkError);
  }

  cards.forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest("a, .rename-btn")) return;
      selectCard(card);
    });
    card.addEventListener("dblclick", function (e) {
      if (e.target.closest("a, .rename-btn")) return;
      window.location.href = "/open/" + encodeURIComponent(card.getAttribute("data-filename"));
    });
  });

  // --- rename ---
  document.querySelectorAll(".rename-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var oldName = btn.getAttribute("data-filename");
      var newName = window.prompt("New file name:", oldName);
      if (!newName || newName === oldName) return;
      var body = new FormData();
      body.append("new_name", newName);
      fetch("/rename_file/" + encodeURIComponent(oldName), { method: "POST", body: body })
        .then(function () { window.location.reload(); })
        .catch(reportNetworkError);
    });
  });

  // --- search + sort ---
  var searchInput = document.getElementById("file-search");
  var fileList = document.getElementById("file-list");
  var sortButtons = document.querySelectorAll(".file-sort button");

  function applyFilter() {
    var q = (searchInput.value || "").toLowerCase();
    cards.forEach(function (card) {
      var name = (card.getAttribute("data-filename") || card.textContent || "").toLowerCase();
      card.style.display = name.indexOf(q) === -1 ? "none" : "";
    });
  }
  if (searchInput) {
    searchInput.addEventListener("input", applyFilter);
  }

  function applySort(key) {
    if (!fileList) return;
    var items = Array.prototype.slice.call(cards);
    items.sort(function (a, b) {
      if (key === "date") {
        return (parseInt(b.getAttribute("data-mtime"), 10) || 0) - (parseInt(a.getAttribute("data-mtime"), 10) || 0);
      }
      var an = (a.getAttribute("data-filename") || "").toLowerCase();
      var bn = (b.getAttribute("data-filename") || "").toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    items.forEach(function (item) { fileList.appendChild(item); });
  }
  sortButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      sortButtons.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      applySort(btn.getAttribute("data-sort"));
    });
  });

  // --- issue edit/mute modal ---
  var modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML =
    '<div class="modal-box">' +
    '  <h3 class="modal-title"></h3>' +
    '  <label class="modal-field">Value<input type="text" class="modal-text"></label>' +
    '  <label class="checkbox-line"><input type="checkbox" class="modal-na"> N/A (mute this)</label>' +
    '  <div class="modal-actions">' +
    '    <button type="button" class="small-btn modal-cancel">Cancel</button>' +
    '    <button type="button" class="small-btn primary modal-save">Save</button>' +
    '  </div>' +
    '</div>';
  document.body.appendChild(modal);
  var modalTitle = modal.querySelector(".modal-title");
  var modalText = modal.querySelector(".modal-text");
  var modalNa = modal.querySelector(".modal-na");
  var modalFieldId = null;

  function openIssueModal(row) {
    modalFieldId = row.getAttribute("data-field-id");
    modalTitle.textContent = row.getAttribute("data-label");
    var isDate = row.getAttribute("data-is-date") === "true";
    modalText.type = isDate ? "date" : "text";
    modalText.value = isDate ? (row.getAttribute("data-date-iso") || "") : (row.getAttribute("data-text") || "");
    modalNa.checked = false;
    modal.classList.add("open");
    modalText.focus();
  }
  function closeModal() {
    modal.classList.remove("open");
    modalFieldId = null;
  }
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });
  modal.querySelector(".modal-cancel").addEventListener("click", closeModal);
  modal.querySelector(".modal-save").addEventListener("click", function () {
    var filename = detailPane.dataset.filename;
    if (!filename || !modalFieldId) return;
    var body = new FormData();
    body.append("text", modalText.value);
    body.append("na", modalNa.checked ? "on" : "off");
    fetch("/field_edit/" + encodeURIComponent(filename) + "/" + encodeURIComponent(modalFieldId), {
      method: "POST", body: body,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) {
          if (data.error === "locked") {
            alert("Someone else is currently editing this file - try again once they're done.");
          }
          return;
        }
        closeModal();
        refreshPanel(filename).then(function () { updateCardIssueCount(filename); });
      })
      .catch(reportNetworkError);
  });

  // --- clicks inside the fetched detail panel: collapse, issue modal, revert/restore ---
  if (detailPane) {
    detailPane.addEventListener("click", function (e) {
      var issueRow = e.target.closest(".issue-row");
      if (issueRow) {
        openIssueModal(issueRow);
        return;
      }

      var revertBtn = e.target.closest("[data-revert-url]");
      if (revertBtn) {
        var val = revertBtn.getAttribute("data-confirm-value");
        if (!confirm("Set this field back to: " + val + "?")) return;
        var filename = detailPane.dataset.filename;
        fetch(revertBtn.getAttribute("data-revert-url") + "?ajax=1", { method: "POST" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.ok) refreshPanel(filename).then(function () { updateCardIssueCount(filename); });
          })
          .catch(reportNetworkError);
        return;
      }

      var restoreBtn = e.target.closest("[data-restore-url]");
      if (restoreBtn) {
        if (!confirm("Restore the whole document to how it looked before any edits? This cannot be undone.")) return;
        var fname = detailPane.dataset.filename;
        fetch(restoreBtn.getAttribute("data-restore-url") + "?ajax=1", { method: "POST" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.ok) refreshPanel(fname).then(function () { updateCardIssueCount(fname); });
          })
          .catch(reportNetworkError);
        return;
      }

      var head = e.target.closest("[data-toggle]");
      if (head) {
        var key = head.getAttribute("data-toggle");
        var box = detailPane.querySelector('[data-body="' + key + '"]');
        if (!box) return;
        var collapsed = box.style.display === "none";
        box.style.display = collapsed ? "" : "none";
        head.classList.toggle("collapsed", !collapsed);
      }
    });
  }

  // --- first-run tutorial tour ---
  // Auto-starts once per browser (localStorage flag, q88_ prefix convention);
  // the ? button in the app bar replays it anytime.
  var TOUR_DONE_KEY = "q88_tutorial_done";

  var TOUR_STEPS = [
    {
      title: "Welcome to Q88 Check",
      body: "This tool lets your team review and edit Q88 V6 vessel questionnaire files together. This quick tour shows you around - it only takes a minute.",
    },
    {
      target: ".toolbar-name",
      focus: "#display-name-input",
      title: "Tell us who you are",
      body: "Type your name here - it is saved automatically. Your name shows other users who is editing a file and appears in every file's edit history.",
      warnIfAnonymous: true,
    },
    {
      target: ".toolbar-panel .toolbar-row",
      title: "Folder and fleets",
      body: "This is the folder currently being watched. Use the fleet buttons to jump between fleet folders, or Import file to copy a .docx into the current folder.",
    },
    {
      target: ".doc-pane",
      title: "Vessel files",
      body: "Every Q88 file in the folder is listed here. Colored badges warn about expired or soon-due dates and empty fields. Click a file once to inspect it, double-click to open the full editor.",
    },
    {
      target: "#detail-pane",
      title: "Issues and history",
      body: "When you select a file, its expiring dates, empty fields and recent edit history appear here. Click an issue row to fix the value right from this panel.",
    },
    {
      target: ".toolbar-sync",
      title: "Keep formatting consistent",
      body: "This copies font, size and color from the reference form into every other file's value cells - the values themselves are never touched.",
    },
    {
      target: "#tour-btn",
      title: "Replay this tour",
      body: "That's it! You can replay this tutorial anytime by clicking this ? button.",
    },
  ];

  var tourActive = false;
  var tourSteps = [];
  var tourIndex = 0;
  var tourSpot = null;
  var tourTip = null;

  function isAnonymous() {
    var val = nameInput ? nameInput.value.trim() : "";
    return !val || val === "Anonymous";
  }

  function positionStep() {
    var step = tourSteps[tourIndex];
    var target = step.target ? document.querySelector(step.target) : null;
    var pad = 6;
    if (target) {
      var rect = target.getBoundingClientRect();
      tourSpot.style.top = rect.top - pad + "px";
      tourSpot.style.left = rect.left - pad + "px";
      tourSpot.style.width = rect.width + pad * 2 + "px";
      tourSpot.style.height = rect.height + pad * 2 + "px";
    } else {
      // centered welcome step: zero-size spotlight still dims the whole page
      tourSpot.style.top = window.innerHeight / 2 + "px";
      tourSpot.style.left = window.innerWidth / 2 + "px";
      tourSpot.style.width = "0px";
      tourSpot.style.height = "0px";
    }
    var tipW = tourTip.offsetWidth;
    var tipH = tourTip.offsetHeight;
    var top, left;
    if (target) {
      var r = target.getBoundingClientRect();
      top = r.bottom + pad + 12;
      if (top + tipH > window.innerHeight - 16) top = r.top - pad - tipH - 12;
      if (top < 16) top = 16;
      left = Math.min(Math.max(r.left, 16), window.innerWidth - tipW - 16);
    } else {
      top = (window.innerHeight - tipH) / 2;
      left = (window.innerWidth - tipW) / 2;
    }
    tourTip.style.top = top + "px";
    tourTip.style.left = left + "px";
  }

  function showStep(i) {
    tourIndex = i;
    var step = tourSteps[i];
    var target = step.target ? document.querySelector(step.target) : null;
    if (target) target.scrollIntoView({ block: "center" });

    var warn = step.warnIfAnonymous && isAnonymous()
      ? '<p class="tour-warn">You are currently "Anonymous" - please set your name now.</p>'
      : "";
    tourTip.innerHTML =
      "<h3></h3>" + warn + "<p class='tour-body'></p>" +
      '<span class="tour-step-count">' + (i + 1) + " / " + tourSteps.length + "</span>" +
      '<div class="tour-actions">' +
      '  <button type="button" class="tour-skip">Skip tour</button>' +
      (i > 0 ? '  <button type="button" class="small-btn tour-back">Back</button>' : "") +
      '  <button type="button" class="small-btn primary tour-next">' +
      (i === tourSteps.length - 1 ? "Done" : "Next") + "</button>" +
      "</div>";
    tourTip.querySelector("h3").textContent = step.title;
    tourTip.querySelector(".tour-body").textContent = step.body;

    tourTip.querySelector(".tour-skip").addEventListener("click", endTour);
    var back = tourTip.querySelector(".tour-back");
    if (back) back.addEventListener("click", function () { showStep(tourIndex - 1); });
    tourTip.querySelector(".tour-next").addEventListener("click", function () {
      if (tourIndex === tourSteps.length - 1) endTour();
      else showStep(tourIndex + 1);
    });

    positionStep();
    if (step.focus) {
      var f = document.querySelector(step.focus);
      if (f) f.focus();
    }
  }

  function endTour() {
    if (!tourActive) return;
    tourActive = false;
    localStorage.setItem(TOUR_DONE_KEY, "1");
    if (tourSpot) tourSpot.remove();
    if (tourTip) tourTip.remove();
    tourSpot = tourTip = null;
  }

  function startTour() {
    if (tourActive) return;
    // keep only steps whose target actually exists on this render
    tourSteps = TOUR_STEPS.filter(function (s) {
      return !s.target || document.querySelector(s.target);
    });
    if (!tourSteps.length) return;
    tourActive = true;
    tourSpot = document.createElement("div");
    tourSpot.className = "tour-spotlight";
    tourTip = document.createElement("div");
    tourTip.className = "tour-tip";
    document.body.appendChild(tourSpot);
    document.body.appendChild(tourTip);
    showStep(0);
  }

  window.addEventListener("resize", function () {
    if (tourActive) positionStep();
  });
  window.addEventListener("scroll", function () {
    if (tourActive) positionStep();
  }, { passive: true });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && tourActive) endTour();
  });

  var tourBtn = document.getElementById("tour-btn");
  if (tourBtn) tourBtn.addEventListener("click", startTour);

  if (!localStorage.getItem(TOUR_DONE_KEY)) startTour();
});
