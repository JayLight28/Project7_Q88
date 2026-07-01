document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".notice").forEach(function (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // --- auto-save display name on blur ---
  var nameInput = document.getElementById("display-name-input");
  if (nameInput) {
    var lastSaved = nameInput.value;
    nameInput.addEventListener("blur", function () {
      var val = nameInput.value.trim();
      if (!val || val === lastSaved) return;
      var body = new FormData();
      body.append("display_name", val);
      fetch("/set_name", { method: "POST", body: body }).then(function () {
        lastSaved = val;
      });
    });
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
    refreshPanel(card.getAttribute("data-filename"));
  }

  cards.forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest("a")) return;
      selectCard(card);
    });
    card.addEventListener("dblclick", function (e) {
      if (e.target.closest("a")) return;
      window.location.href = "/open/" + encodeURIComponent(card.getAttribute("data-filename"));
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
    modalText.value = row.getAttribute("data-text") || "";
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
        if (!data.ok) return;
        closeModal();
        refreshPanel(filename).then(function () { updateCardIssueCount(filename); });
      });
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
          });
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
          });
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
});
