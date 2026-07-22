function q88InitPage() {
  var body = document.body;
  var filename = body.getAttribute("data-filename");
  var readOnly = body.getAttribute("data-readonly") === "true";
  var scrollKey = filename ? "q88-scroll:" + filename : null;
  var collapseKey = filename ? "q88-collapsed:" + filename : null;

  // --- collapsible sections ---
  function sectionRows(id) {
    return document.querySelectorAll('tr[data-section="' + id + '"]:not(.row-heading)');
  }
  function headingEl(id) {
    return document.getElementById(id);
  }
  function setCollapsed(id, collapsed) {
    var heading = headingEl(id);
    if (heading) heading.classList.toggle("collapsed", collapsed);
    sectionRows(id).forEach(function (row) {
      row.classList.toggle("section-hidden", collapsed);
    });
  }
  function saveCollapsedState() {
    if (!collapseKey) return;
    var ids = [];
    document.querySelectorAll(".row-heading.collapsed").forEach(function (h) {
      ids.push(h.id);
    });
    sessionStorage.setItem(collapseKey, JSON.stringify(ids));
  }
  function restoreCollapsedState() {
    if (!collapseKey) return;
    var raw = sessionStorage.getItem(collapseKey);
    if (!raw) return;
    try {
      JSON.parse(raw).forEach(function (id) { setCollapsed(id, true); });
    } catch (e) { /* ignore corrupt state */ }
  }

  document.querySelectorAll(".row-heading").forEach(function (heading) {
    heading.style.cursor = "pointer";
    heading.addEventListener("click", function () {
      var collapsed = !heading.classList.contains("collapsed");
      setCollapsed(heading.id, collapsed);
      saveCollapsedState();
    });
  });

  var collapseAllBtn = document.getElementById("collapse-all-btn");
  var expandAllBtn = document.getElementById("expand-all-btn");
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener("click", function () {
      document.querySelectorAll(".row-heading").forEach(function (h) { setCollapsed(h.id, true); });
      saveCollapsedState();
    });
  }
  if (expandAllBtn) {
    expandAllBtn.addEventListener("click", function () {
      document.querySelectorAll(".row-heading").forEach(function (h) { setCollapsed(h.id, false); });
      saveCollapsedState();
    });
  }
  restoreCollapsedState();

  // --- sidebar nav ---
  var navLinks = document.querySelectorAll(".sidebar-nav a");
  navLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var targetId = link.getAttribute("href").slice(1);
      var parentSection = link.getAttribute("data-nav-section");
      if (parentSection) setCollapsed(parentSection, false);
      saveCollapsedState();
      var el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      navLinks.forEach(function (l) { l.classList.remove("active"); });
      link.classList.add("active");
    });
  });

  // --- scroll restore after an AJAX round trip ---
  if (scrollKey) {
    var savedY = sessionStorage.getItem(scrollKey);
    if (savedY !== null) {
      window.scrollTo(0, parseInt(savedY, 10));
      sessionStorage.removeItem(scrollKey);
    }
  }

  // --- AJAX form submission: no full page navigation, so scroll never resets ---
  var form = document.getElementById("q88-form");
  if (form) {
    var dirty = false;
    form.addEventListener("input", function (e) {
      if (e.target.matches('input[type="text"], input[type="date"], input[type="checkbox"], textarea')) {
        dirty = true;
      }
    });
    window.addEventListener("beforeunload", function (e) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    var saveStatus = document.getElementById("save-status");
    function setSaveStatus(text, isError) {
      if (!saveStatus) return;
      saveStatus.textContent = text;
      saveStatus.classList.toggle("error", !!isError);
    }

    // --- save confirmation: list what actually changed before writing ---
    function fieldLabel(el) {
      var tr = el.closest("tr");
      if (!tr) return el.name;
      var lab = tr.querySelector("td.label");
      if (lab) {
        var code = tr.querySelector("td.item-code");
        return ((code ? code.textContent.trim() + " " : "") + lab.textContent.trim()).replace(/\s+/g, " ");
      }
      var wrap = el.closest(".row-table-wrap");
      var title = wrap ? wrap.querySelector(".sub-table-title") : null;
      var first = tr.cells && tr.cells.length ? tr.cells[0].textContent.trim() : "";
      var t = title ? title.textContent.trim().replace(/\s+/g, " ") : "";
      return (t && first ? t + " - " + first : t || first) || el.name;
    }

    function collectChanges() {
      var changes = [];
      form.querySelectorAll('input[name^="f_"], textarea[name^="f_"]').forEach(function (el) {
        if (el.value !== el.defaultValue) {
          changes.push({ label: fieldLabel(el), oldVal: el.defaultValue, newVal: el.value });
        }
      });
      form.querySelectorAll('input[type="checkbox"][name^="na_"]').forEach(function (el) {
        if (el.checked !== el.defaultChecked) {
          changes.push({
            label: fieldLabel(el),
            oldVal: el.defaultChecked ? "N/A checked" : "N/A unchecked",
            newVal: el.checked ? "N/A checked" : "N/A unchecked",
          });
        }
      });
      return changes;
    }

    var diffModal = document.createElement("div");
    diffModal.className = "modal-overlay";
    diffModal.innerHTML =
      '<div class="modal-box diff-box">' +
      '  <h3 class="modal-title"></h3>' +
      '  <div class="diff-list"></div>' +
      '  <div class="modal-actions">' +
      '    <button type="button" class="small-btn diff-cancel">Cancel</button>' +
      '    <button type="button" class="small-btn primary diff-confirm">Save</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(diffModal);
    var diffOnConfirm = null;
    function closeDiffModal() {
      diffModal.classList.remove("open");
      diffOnConfirm = null;
    }
    diffModal.addEventListener("click", function (e) {
      if (e.target === diffModal) closeDiffModal();
    });
    diffModal.querySelector(".diff-cancel").addEventListener("click", closeDiffModal);
    diffModal.querySelector(".diff-confirm").addEventListener("click", function () {
      var fn = diffOnConfirm;
      closeDiffModal();
      if (fn) fn();
    });

    function openDiffModal(changes, onConfirm) {
      diffModal.querySelector(".modal-title").textContent =
        "Save " + changes.length + " change" + (changes.length === 1 ? "" : "s") + "?";
      var list = diffModal.querySelector(".diff-list");
      list.innerHTML = "";
      changes.forEach(function (c) {
        // textContent only - cell values are user data, never render as HTML
        var row = document.createElement("div");
        row.className = "diff-row";
        var label = document.createElement("div");
        label.className = "diff-label";
        label.textContent = c.label;
        var vals = document.createElement("div");
        vals.className = "diff-values";
        var oldSpan = document.createElement("span");
        oldSpan.className = "diff-old";
        oldSpan.textContent = c.oldVal === "" ? "(empty)" : c.oldVal;
        var arrow = document.createElement("span");
        arrow.className = "diff-arrow";
        arrow.innerHTML = "&#8594;";
        var newSpan = document.createElement("span");
        newSpan.className = "diff-new";
        newSpan.textContent = c.newVal === "" ? "(empty)" : c.newVal;
        vals.appendChild(oldSpan);
        vals.appendChild(arrow);
        vals.appendChild(newSpan);
        row.appendChild(label);
        row.appendChild(vals);
        list.appendChild(row);
      });
      diffOnConfirm = onConfirm;
      diffModal.classList.add("open");
    }

    function performSave(url, isSaveAs) {
      var formData = new FormData(form);
      sessionStorage.setItem(scrollKey, window.scrollY);
      setSaveStatus("Saving...", false);

      // X-Q88-Ajax makes the server answer a lost-lock conflict with a 409
      // instead of a redirect (fetch silently follows redirects to a 200,
      // which would wipe this page and everything typed into it)
      fetch(url, { method: "POST", body: formData, headers: { "X-Q88-Ajax": "1" } })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        })
        .then(function (html) {
          var newDoc = new DOMParser().parseFromString(html, "text/html");
          document.body.innerHTML = newDoc.body.innerHTML;
          document.body.className = newDoc.body.className;
          document.body.setAttribute("data-filename", newDoc.body.getAttribute("data-filename"));
          document.body.setAttribute("data-readonly", newDoc.body.getAttribute("data-readonly"));
          document.title = newDoc.title;
          dirty = false;
          q88InitPage();
          if (!isSaveAs) {
            var now = new Date();
            var hh = String(now.getHours()).padStart(2, "0");
            var mm = String(now.getMinutes()).padStart(2, "0");
            var status = document.getElementById("save-status");
            if (status) { status.textContent = "Saved at " + hh + ":" + mm; status.classList.remove("error"); }
          }
        })
        .catch(function (err) {
          // NEVER navigate away here: replacing/leaving the page on a failed
          // save is how typed edits got lost (server down -> form.submit()
          // -> browser error page -> everything gone). Keep the page, keep
          // the input, let the user press Save again.
          console.error("save failed", err);
          var msg = err && err.message === "HTTP 409"
            ? "Someone else took over editing this file - your typed values are still on this page. Copy anything important, then refresh."
            : "Save failed (" + (err && err.message ? err.message : "network error") + ") - your edits are still on this page. Please try Save again.";
          setSaveStatus(msg, true);
        });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var submitter = e.submitter;
      var isSaveAs = !!(submitter && submitter.hasAttribute("data-save-as"));
      var url = (submitter && submitter.getAttribute("formaction")) || form.action;
      // only the plain Save button gets the confirmation step - Save As makes
      // a copy (original untouched) and the add/delete-row buttons are their
      // own immediate actions
      var isPlainSave = !isSaveAs && !(submitter && submitter.hasAttribute("formaction"));
      if (isPlainSave) {
        var changes = collectChanges();
        if (changes.length) {
          openDiffModal(changes, function () { performSave(url, false); });
          return;
        }
      }
      performSave(url, isSaveAs);
    });
  }

  // --- issues panel (floating, works at any scroll position) ---
  var issuesBtn = document.getElementById("issues-fab");
  var issuesPanel = document.getElementById("issues-panel");
  var issuesCloseBtn = document.getElementById("issues-close-btn");
  if (issuesBtn && issuesPanel) {
    issuesBtn.addEventListener("click", function () {
      issuesPanel.classList.toggle("open");
    });
    if (issuesCloseBtn) {
      issuesCloseBtn.addEventListener("click", function () {
        issuesPanel.classList.remove("open");
      });
    }
    issuesPanel.classList.add("open");

    issuesPanel.querySelectorAll(".issue-row").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        issuesPanel.classList.remove("open");
        var targetId = link.getAttribute("href").slice(1);
        var el = document.getElementById(targetId);
        if (el) {
          var section = el.closest("tr") ? el.closest("tr").getAttribute("data-section") : null;
          if (section) setCollapsed(section, false);
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("flash-highlight");
          setTimeout(function () { el.classList.remove("flash-highlight"); }, 2000);
        }
      });
    });
  }

  function updateIssueCount() {
    if (!issuesPanel || !issuesBtn) return;
    var visible = 0;
    issuesPanel.querySelectorAll(".issue-row").forEach(function (row) {
      if (row.style.display !== "none") visible++;
    });
    issuesBtn.textContent = "Issues (" + visible + ")";
  }

  // --- N/A checkbox: suppress the highlight and issue-list entry instantly,
  // without waiting for Save, so it's obvious the flag actually took effect ---
  document.querySelectorAll('input[type="checkbox"][name^="na_"]').forEach(function (cb) {
    var fid = cb.name.slice(3);
    var cell = document.getElementById("field-" + fid);
    if (!cell) return;
    var stateMatch = cell.className.match(/state-\S+/);
    if (stateMatch) cell.dataset.origState = stateMatch[0];

    var applySuppressed = function (suppressed) {
      if (cell.dataset.origState) {
        cell.classList.remove(cell.dataset.origState);
        cell.classList.add(suppressed ? "state-OK" : cell.dataset.origState);
      }
      if (issuesPanel) {
        var issueLink = issuesPanel.querySelector('a[href="#field-' + fid + '"]');
        if (issueLink) {
          issueLink.style.display = suppressed ? "none" : "";
          updateIssueCount();
        }
      }
    };

    if (cb.checked) applySuppressed(true);
    cb.addEventListener("change", function () { applySuppressed(cb.checked); });
  });

  if (!filename) return;

  if (!readOnly) {
    var lockNoticeText = "";
    function showLockNotice(text, isConflict) {
      if (lockNoticeText === text) return; // don't re-add every heartbeat
      lockNoticeText = text;
      var old = document.getElementById("lock-notice");
      if (old) old.remove();
      var banner = document.createElement("div");
      banner.id = "lock-notice";
      banner.className = "lock-banner" + (isConflict ? " conflict" : "");
      var icon = document.createElement("span");
      icon.className = "banner-icon";
      icon.innerHTML = isConflict ? "&#9888;" : "&#128275;"; // static icon, matches the template entities
      var msg = document.createElement("span");
      msg.textContent = " " + text + " ";
      var dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "Dismiss";
      dismiss.addEventListener("click", function () { banner.remove(); });
      banner.appendChild(icon);
      banner.appendChild(msg);
      banner.appendChild(dismiss);
      var main = document.querySelector(".main-pane");
      if (main) main.insertBefore(banner, main.firstChild);
    }

    // the heartbeat runs for the whole lifetime of the editor page to keep
    // the server-side edit lock alive - but q88InitPage re-runs after every
    // AJAX save (body replacement), so the previous interval must be cleared
    // or a stale one keeps heartbeating the OLD filename after a date-rename
    // and falsely triggers the "lock lapsed" notice
    if (window._q88HeartbeatTimer) clearInterval(window._q88HeartbeatTimer);
    window._q88HeartbeatTimer = setInterval(function () {
      fetch("/heartbeat/" + encodeURIComponent(filename), { method: "POST" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) {
            showLockNotice(
              (data.holder || "Someone else") + " has taken over editing this file - your next save will be rejected. Copy anything important, then refresh.",
              true
            );
          } else if (data.resumed) {
            showLockNotice(
              "Your edit lock lapsed (no contact with the server for over 3 minutes) and was just re-acquired. If someone else edited this file in the meantime, refresh before saving.",
              false
            );
          }
        })
        .catch(function (err) { console.error("heartbeat failed", err); });
    }, 60000);
    window.addEventListener("beforeunload", function () {
      navigator.sendBeacon("/release/" + encodeURIComponent(filename));
    });
  } else {
    // page re-rendered read-only: stop any heartbeat left over from a
    // previous editable render so it can't keep touching the lock
    if (window._q88HeartbeatTimer) {
      clearInterval(window._q88HeartbeatTimer);
      window._q88HeartbeatTimer = null;
    }
    var refreshBtn = document.getElementById("refresh-lock-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        window.location.reload();
      });
    }
    var poll = setInterval(function () {
      fetch("/lock_status/" + encodeURIComponent(filename))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.locked && refreshBtn) {
            refreshBtn.textContent = "Now editable - Refresh";
            clearInterval(poll);
          }
        })
        .catch(function (err) { console.error("lock_status poll failed", err); });
    }, 15000);
  }
}

document.addEventListener("DOMContentLoaded", q88InitPage);
