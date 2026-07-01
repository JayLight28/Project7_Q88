function q88InitPage() {
  var body = document.body;
  var filename = body.getAttribute("data-filename");
  var readOnly = body.getAttribute("data-readonly") === "true";
  var scrollKey = filename ? "q88-scroll:" + filename : null;
  var collapseKey = filename ? "q88-collapsed:" + filename : null;

  // --- warning-days control ---
  var viewInput = document.getElementById("warning_days_view");
  var hiddenInput = document.getElementById("warning_days");
  var applyBtn = document.getElementById("apply-warning-days");

  if (viewInput && hiddenInput) {
    viewInput.addEventListener("input", function () {
      hiddenInput.value = viewInput.value;
    });
  }
  if (applyBtn) {
    applyBtn.addEventListener("click", function () {
      var url = new URL(window.location.href);
      url.searchParams.set("warning_days", viewInput.value);
      window.location.href = url.toString();
    });
  }

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
      if (e.target.matches('input[type="text"], input[type="checkbox"]')) {
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

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var submitter = e.submitter;
      var isSaveAs = !!(submitter && submitter.hasAttribute("data-save-as"));
      var url = (submitter && submitter.getAttribute("formaction")) || form.action;
      var formData = new FormData(form);
      sessionStorage.setItem(scrollKey, window.scrollY);
      setSaveStatus("Saving...", false);

      fetch(url, { method: "POST", body: formData })
        .then(function (r) { return r.text(); })
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
        .catch(function () {
          setSaveStatus("Save failed - retrying...", true);
          // network hiccup - fall back to a normal submit so the edit isn't lost
          // (HTMLFormElement.submit() bypasses the "submit" event, so this won't loop)
          form.submit();
        });
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
    setInterval(function () {
      fetch("/heartbeat/" + encodeURIComponent(filename), { method: "POST" });
    }, 60000);
    window.addEventListener("beforeunload", function () {
      navigator.sendBeacon("/release/" + encodeURIComponent(filename));
    });
  } else {
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
        });
    }, 15000);
  }
}

document.addEventListener("DOMContentLoaded", q88InitPage);
