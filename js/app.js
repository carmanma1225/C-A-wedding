(function () {
  "use strict";

  var config = window.WEDDING_CONFIG || {};
  var I18N = window.I18N || {};
  var currentLang = getInitialLanguage();
  var maxFileMB = Math.max(1, Number(config.maxFileMB) || 25);
  var maxBytes = maxFileMB * 1024 * 1024;
  var maxQueue = 100;

  var ALLOWED_EXTENSIONS = new Set([
    "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif", "bmp", "tiff",
    "mov", "mp4", "m4v", "webm", "avi", "mkv", "3gp"
  ]);

  var VIDEO_EXTENSIONS = new Set([
    "mov", "mp4", "m4v", "webm", "avi", "mkv", "3gp"
  ]);

  var els = {
    eventDate: document.getElementById("event-date"),
    driveStatus: document.getElementById("drive-status"),
    driveStatusDot: document.getElementById("drive-status-dot"),
    driveStatusText: document.getElementById("drive-status-text"),
    setupBanner: document.getElementById("setup-banner"),
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("file-input"),
    fileSummary: document.getElementById("file-summary"),
    guestName: document.getElementById("guest-name"),
    guestNote: document.getElementById("guest-note"),
    queueSection: document.getElementById("queue-section"),
    queueCount: document.getElementById("queue-count"),
    fileQueue: document.getElementById("file-queue"),
    uploadButton: document.getElementById("upload-button"),
    clearButton: document.getElementById("clear-button"),
    statusRegion: document.getElementById("status-region"),
    langButtons: Array.prototype.slice.call(document.querySelectorAll(".lang-toggle__button"))
  };

  var state = {
    items: [],
    uploading: false
  };

  var rowElements = new Map();
  var statusTimer = null;

  function init() {
    applyLanguage();
    applyWeddingDetails();
    applyDriveStatus();
    bindEvents();
    renderQueue();
    updateButtons();
  }

  function getInitialLanguage() {
    var saved = "";
    try {
      saved = localStorage.getItem("wedding-lang") || "";
    } catch (error) {
      saved = "";
    }
    var requested = saved || config.defaultLanguage || "zh-Hant";
    return requested === "en" ? "en" : "zh-Hant";
  }

  function t(key, vars) {
    var table = I18N[currentLang] || I18N["zh-Hant"] || {};
    var text = table[key];
    if (text == null) {
      text = (I18N.en && I18N.en[key]) || key;
    }
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = String(text).split("{" + name + "}").join(String(vars[name]));
      });
    }
    return text;
  }

  function applyLanguage() {
    document.documentElement.lang = currentLang === "en" ? "en" : "zh-Hant";
    document.title = t("title");

    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-placeholder]"), function (el) {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria-label]"), function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });

    els.langButtons.forEach(function (button) {
      var active = button.dataset.lang === currentLang;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function applyWeddingDetails() {
    document.title = t("title");
    els.eventDate.textContent = t("eventDate");
  }

  function applyDriveStatus() {
    var connected = Boolean(config.appsScriptUrl);
    els.driveStatus.hidden = false;
    els.driveStatusDot.classList.toggle("drive-status__dot--ok", connected);
    els.driveStatusText.textContent = t(connected ? "driveConnected" : "driveSetupNeeded");
    els.setupBanner.hidden = connected;
  }

  function bindEvents() {
    els.fileInput.addEventListener("change", function () {
      addFiles(els.fileInput.files);
      els.fileInput.value = "";
    });

    els.dropzone.addEventListener("dragover", preventAndDrag);
    els.dropzone.addEventListener("dragenter", preventAndDrag);
    els.dropzone.addEventListener("dragleave", function (event) {
      if (!els.dropzone.contains(event.relatedTarget)) {
        els.dropzone.classList.remove("is-dragging");
      }
    });
    els.dropzone.addEventListener("drop", function (event) {
      event.preventDefault();
      els.dropzone.classList.remove("is-dragging");
      if (!state.uploading) {
        addFiles(event.dataTransfer.files);
      }
    });

    window.addEventListener("dragover", function (event) {
      event.preventDefault();
    });
    window.addEventListener("drop", function (event) {
      event.preventDefault();
    });

    els.uploadButton.addEventListener("click", uploadAll);
    els.clearButton.addEventListener("click", clearAll);

    els.langButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        currentLang = button.dataset.lang === "en" ? "en" : "zh-Hant";
        try {
          localStorage.setItem("wedding-lang", currentLang);
        } catch (error) {
          // Language preference is optional; continue without storage.
        }
        applyLanguage();
        applyDriveStatus();
        renderQueue();
        updateButtons();
        hideStatus();
      });
    });

    els.fileQueue.addEventListener("click", function (event) {
      var button = event.target.closest("[data-action]");
      if (!button) return;
      var item = findItem(button.dataset.id);
      if (!item) return;

      if (button.dataset.action === "remove") {
        removeItem(item.id);
      } else if (button.dataset.action === "retry") {
        item.status = "pending";
        item.progress = 0;
        item.error = "";
        updateItemUI(item);
        updateButtons();
        uploadAll();
      }
    });

    window.addEventListener("beforeunload", function (event) {
      if (state.uploading) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  function preventAndDrag(event) {
    event.preventDefault();
    els.dropzone.classList.add("is-dragging");
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var added = 0;

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (state.items.length + added >= maxQueue) {
        showToast(t("maxFiles", { max: maxQueue }));
        break;
      }
      if (!isAllowedFile(file)) {
        showToast(t("notAllowed", { name: file.name }));
        continue;
      }
      if (file.size > maxBytes) {
        showToast(t("tooLarge", { name: file.name, max: maxFileMB }));
        continue;
      }
      state.items.push(createItem(file));
      added += 1;
    }

    if (added > 0) {
      renderQueue();
      updateButtons();
    }
  }

  function createItem(file) {
    return {
      id: makeId(),
      file: file,
      status: "pending",
      progress: 0,
      error: ""
    };
  }

  function makeId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "file-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  function isAllowedFile(file) {
    if (/^image\//i.test(file.type) || /^video\//i.test(file.type)) {
      return true;
    }
    return ALLOWED_EXTENSIONS.has(fileExtension(file.name));
  }

  function fileExtension(name) {
    var dot = String(name || "").lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  }

  function isVideo(file) {
    if (/^video\//i.test(file.type)) return true;
    return VIDEO_EXTENSIONS.has(fileExtension(file.name));
  }

  function renderQueue() {
    var hasItems = state.items.length > 0;
    els.queueSection.hidden = !hasItems;
    els.fileQueue.textContent = "";
    rowElements.clear();

    state.items.forEach(function (item) {
      var row = buildRow(item);
      rowElements.set(item.id, row);
      els.fileQueue.appendChild(row);
      updateItemUI(item);
    });

    updateQueueSummary();
  }

  function updateQueueSummary() {
    var total = state.items.length;
    if (total === 0) {
      els.fileSummary.textContent = t("noFiles");
      els.queueCount.textContent = "";
      return;
    }

    var photos = 0;
    var videos = 0;
    var totalBytes = 0;
    state.items.forEach(function (item) {
      totalBytes += item.file.size;
      if (isVideo(item.file)) {
        videos += 1;
      } else {
        photos += 1;
      }
    });

    var parts = [];
    if (photos > 0) parts.push(t("photoCount", { count: photos }));
    if (videos > 0) parts.push(t("videoCount", { count: videos }));
    parts.push(formatBytes(totalBytes));

    els.fileSummary.textContent = parts.join(" · ");
    els.queueCount.textContent = t("fileCount", { count: total });
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    var units = ["B", "KB", "MB", "GB"];
    var value = bytes;
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return value.toFixed(unit === 0 ? 0 : 1) + " " + units[unit];
  }

  function buildRow(item) {
    var row = document.createElement("li");
    row.className = "file-row";
    row.dataset.id = item.id;

    var icon = document.createElement("span");
    icon.className = "file-row__icon" + (isVideo(item.file) ? " file-row__icon--video" : "");
    icon.textContent = isVideo(item.file) ? t("videoLabel") : t("photoLabel");

    var body = document.createElement("div");
    body.className = "file-row__body";

    var name = document.createElement("p");
    name.className = "file-row__name";
    name.textContent = item.file.name;

    var meta = document.createElement("div");
    meta.className = "file-row__meta";

    var size = document.createElement("span");
    size.textContent = formatBytes(item.file.size);

    var status = document.createElement("span");
    status.setAttribute("data-role", "status");

    meta.appendChild(size);
    meta.appendChild(status);

    var progressWrap = document.createElement("div");
    progressWrap.className = "file-row__progress";
    progressWrap.setAttribute("role", "progressbar");
    progressWrap.setAttribute("data-role", "progressbar");
    progressWrap.setAttribute("aria-label", "Upload progress");
    progressWrap.setAttribute("aria-valuemin", "0");
    progressWrap.setAttribute("aria-valuemax", "100");
    progressWrap.setAttribute("aria-valuenow", "0");

    var bar = document.createElement("span");
    bar.className = "file-row__bar";
    bar.setAttribute("data-role", "bar");
    progressWrap.appendChild(bar);

    body.appendChild(name);
    body.appendChild(meta);
    body.appendChild(progressWrap);

    var actions = document.createElement("div");
    actions.className = "file-row__actions";

    var retry = document.createElement("button");
    retry.type = "button";
    retry.className = "file-row__action";
    retry.dataset.action = "retry";
    retry.dataset.id = item.id;
    retry.textContent = t("retry");
    retry.hidden = true;

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "file-row__action";
    remove.dataset.action = "remove";
    remove.dataset.id = item.id;
    remove.textContent = t("remove");

    actions.appendChild(retry);
    actions.appendChild(remove);

    row.appendChild(icon);
    row.appendChild(body);
    row.appendChild(actions);

    updateItemUI(item);
    return row;
  }

  function updateItemUI(item) {
    var row = rowElements.get(item.id);
    if (!row) return;

    var statusEl = row.querySelector('[data-role="status"]');
    var barEl = row.querySelector('[data-role="bar"]');
    var progressWrap = row.querySelector('[data-role="progressbar"]');
    var retryBtn = row.querySelector('[data-action="retry"]');
    var removeBtn = row.querySelector('[data-action="remove"]');

    var progress = 0;
    var label = t("statusReady");
    var statusClass = "";
    var working = false;

    if (item.status === "preparing") {
      label = t("statusPreparing");
      working = true;
    } else if (item.status === "uploading") {
      progress = item.progress || 10;
      label = item.progress > 0 ? t("statusUploading", { progress: progress }) : t("statusUploadingText");
      statusClass = "status--working";
      working = true;
    } else if (item.status === "done") {
      progress = 100;
      label = t("statusSaved");
      statusClass = "status--ok";
    } else if (item.status === "error") {
      label = t("statusFailed");
      statusClass = "status--error";
      statusEl.title = item.error || t("uploadFailed");
    } else {
      statusEl.removeAttribute("title");
    }

    barEl.style.width = progress + "%";
    barEl.classList.toggle("file-row__bar--working", working);
    statusEl.textContent = label;
    statusEl.className = statusClass;
    progressWrap.setAttribute("aria-valuenow", String(progress));

    retryBtn.hidden = item.status !== "error";
    removeBtn.hidden = item.status === "done";
    removeBtn.disabled = state.uploading;
  }

  function updateButtons() {
    var canUpload = Boolean(config.appsScriptUrl) &&
      state.items.some(function (item) {
        return item.status === "pending" || item.status === "error";
      });

    els.uploadButton.disabled = state.uploading || !canUpload;
    els.uploadButton.textContent = t(state.uploading ? "uploadingButton" : "uploadButton");
    els.clearButton.hidden = state.items.length === 0;
    els.clearButton.disabled = state.uploading;
    els.dropzone.setAttribute("aria-disabled", String(state.uploading));
    els.fileInput.disabled = state.uploading;
  }

  function findItem(id) {
    return state.items.find(function (item) {
      return item.id === id;
    });
  }

  function removeItem(id) {
    if (state.uploading) return;
    state.items = state.items.filter(function (item) {
      return item.id !== id;
    });
    renderQueue();
    updateButtons();
  }

  function clearAll() {
    if (state.uploading) return;
    state.items = [];
    hideStatus();
    renderQueue();
    updateButtons();
  }

  function getGuestMeta() {
    return {
      name: els.guestName.value.trim(),
      note: els.guestNote.value.trim()
    };
  }

  function uploadAll() {
    if (state.uploading) return;
    var pending = state.items.filter(function (item) {
      return item.status === "pending" || item.status === "error";
    });
    if (pending.length === 0) return;

    state.uploading = true;
    updateButtons();

    var meta = getGuestMeta();
    var succeeded = 0;
    var attempts = pending.length;

    runUploads(pending, meta, attempts, succeeded);
  }

  function runUploads(items, meta, attempts, succeeded) {
    var index = 0;

    function next() {
      if (index >= items.length) {
        finishUpload(attempts, succeeded);
        return;
      }

      var item = items[index];
      index += 1;
      item.status = "preparing";
      item.progress = 0;
      item.error = "";
      updateItemUI(item);

      uploadFile(item, meta)
        .then(function () {
          item.status = "done";
          item.progress = 100;
          succeeded += 1;
          updateItemUI(item);
          next();
        })
        .catch(function (error) {
          item.status = "error";
          item.error = friendlyError(error);
          updateItemUI(item);
          next();
        });
    }

    next();
  }

  function finishUpload(attempts, succeeded) {
    state.uploading = false;
    updateButtons();

    var failed = attempts - succeeded;
    if (failed === 0) {
      showStatus(t("savedSuccess", { count: succeeded }), "ok", true);
    } else if (succeeded > 0) {
      showStatus(t("savedMixed", { saved: succeeded, failed: failed }), "info", true);
    } else {
      var failedItems = state.items.filter(function (item) {
        return item.status === "error";
      });
      var firstError = failedItems.length > 0 ? failedItems[0].error : "";
      showStatus(firstError || t("savedNone"), "error", true);
    }
  }

  function uploadFile(item, meta) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onerror = function () {
        reject(new Error(t("readError")));
      };

      reader.onload = function () {
        var base64 = String(reader.result).split(",")[1] || "";
        var payload = {
          fileName: item.file.name,
          mimeType: item.file.type || "application/octet-stream",
          base64: base64,
          name: meta.name,
          note: meta.note
        };

        item.status = "uploading";
        item.progress = 0;
        updateItemUI(item);

        var controller = new AbortController();
        var timer = setTimeout(function () {
          controller.abort();
          reject(new Error(t("timeoutError")));
        }, 180000);

        fetch(config.appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
          .then(function (response) {
            return response.text();
          })
          .then(function (text) {
            clearTimeout(timer);
            var data;
            try {
              data = JSON.parse(text);
            } catch (error) {
              reject(new Error(t("invalidResponse")));
              return;
            }
            if (data && data.ok) {
              resolve(data);
            } else {
              reject(new Error((data && data.error) || t("rejected")));
            }
          })
          .catch(function (error) {
            clearTimeout(timer);
            if (error && error.name === "AbortError") {
              reject(new Error(t("timeoutError")));
            } else {
              reject(new Error(t("networkError")));
            }
          });
      };

      reader.readAsDataURL(item.file);
    });
  }

  function friendlyError(error) {
    return error && error.message ? error.message : t("uploadFailed");
  }

  function showStatus(message, type, persist) {
    clearTimeout(statusTimer);
    els.statusRegion.hidden = false;
    els.statusRegion.className = "status-region status-region--" + type;
    els.statusRegion.textContent = message;

    if (!persist) {
      statusTimer = setTimeout(hideStatus, 8000);
    }
  }

  function showToast(message) {
    showStatus(message, "info", false);
  }

  function hideStatus() {
    clearTimeout(statusTimer);
    els.statusRegion.hidden = true;
    els.statusRegion.textContent = "";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
