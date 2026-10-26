/**
 * Carman & Anthony wedding photo & video collector.
 *
 * The website sends base64-encoded files to this web app, which saves them
 * into the Google Drive folder below using names such as:
 *   photo 1_Carman.jpg
 *   video 1_Anthony.mp4
 *
 * After changing this file, redeploy the Apps Script web app with a new
 * version so the public website uses the updated code.
 */

var FOLDER_ID = "1c2x4INo6cnXt7BmPD0m6lBkwipHya6qj";
var MAX_FILE_BYTES = 25 * 1024 * 1024;

var VIDEO_EXTENSIONS = {
  "3gp": true,
  "avi": true,
  "m4v": true,
  "mkv": true,
  "mov": true,
  "mp4": true,
  "webm": true
};

var MIME_EXTENSIONS = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/3gpp": "3gp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
};

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ ok: false, error: "Could not read the upload payload." });
  }

  try {
    if (!FOLDER_ID) {
      throw new Error("FOLDER_ID is not set in Code.gs.");
    }

    var base64 = String(body.base64 || "");
    if (!base64) {
      throw new Error("No file data received.");
    }
    if (base64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3)) {
      throw new Error("File is too large for this uploader.");
    }

    var mimeType = cleanText(body.mimeType || "application/octet-stream", 120);
    var originalName = cleanText(body.fileName || "guest-upload", 180);
    var guestName = sanitizeGuestName(body.name);
    if (!guestName) {
      throw new Error("Guest name is required.");
    }
    var note = cleanText(body.note, 1000);
    var bytes = Utilities.base64Decode(base64);

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var folder = DriveApp.getFolderById(FOLDER_ID);
      var file = saveFile(folder, bytes, mimeType, originalName, guestName, note);
      return respond({ ok: true, id: file.getId(), name: file.getName() });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function saveFile(folder, bytes, mimeType, originalName, guestName, note) {
  var kind = getMediaKind(mimeType, originalName);
  var prefix = kind === "video" ? "video" : "photo";
  var number = getNextFileNumber(folder, prefix);
  var extension = getFileExtension(originalName, mimeType, kind);
  var finalName = prefix + " " + number + "_" + guestName + "." + extension;

  var blob = Utilities.newBlob(bytes, mimeType, finalName);
  var file = folder.createFile(blob);

  if (note) {
    var meta = {
      fileName: file.getName(),
      originalFileName: originalName,
      kind: kind,
      number: number,
      uploadedAt: new Date().toISOString(),
      name: guestName,
      note: note
    };
    folder.createFile(
      Utilities.newBlob(
        JSON.stringify(meta, null, 2),
        "application/json",
        file.getName() + ".metadata.json"
      )
    );
  }

  return file;
}

function getNextFileNumber(folder, prefix) {
  var highest = 0;
  var files = folder.getFiles();
  var pattern = new RegExp("^" + prefix + " (\\d+)(?:_|\\.)");

  while (files.hasNext()) {
    var match = files.next().getName().match(pattern);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }

  return highest + 1;
}

function getMediaKind(mimeType, fileName) {
  if (/^video\//i.test(mimeType)) {
    return "video";
  }
  return VIDEO_EXTENSIONS[getRawExtension(fileName)] ? "video" : "photo";
}

function getFileExtension(fileName, mimeType, kind) {
  var existing = getRawExtension(fileName);
  if (existing) {
    return existing === "jpeg" ? "jpg" : existing;
  }
  return MIME_EXTENSIONS[String(mimeType).toLowerCase()] || (kind === "video" ? "mp4" : "jpg");
}

function getRawExtension(fileName) {
  var match = String(fileName || "").match(/\.([A-Za-z0-9]{1,8})$/);
  return match ? match[1].toLowerCase() : "";
}

function sanitizeGuestName(name) {
  return cleanText(name, 80)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function respond(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
