/**
 * Wedding guest photo & video collector.
 *
 * The website sends base64-encoded files to this web app, which saves them
 * into the Google Drive folder below.
 *
 * Deployment steps (also in README.md):
 * 1. Create a Google Drive folder for uploads and copy its folder ID.
 * 2. Open script.google.com, create a new project, and paste this file
 *    into Code.gs.
 * 3. Set FOLDER_ID below.
 * 4. Deploy > New deployment > Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the web app URL into js/config.js as appsScriptUrl.
 */

var FOLDER_ID = "1c2x4INo6cnXt7BmPD0m6lBkwipHya6qj"; // Carman & Anthony guest uploads

var MAX_FILE_BYTES = 25 * 1024 * 1024;

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

    var mimeType = String(body.mimeType || "application/octet-stream").slice(0, 120);
    var fileName = sanitizeFileName(body.fileName || "guest-upload");
    var stamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyyMMdd-HHmmss"
    );
    fileName = stamp + "_" + fileName;

    var bytes = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var folder = DriveApp.getFolderById(FOLDER_ID);
    var file = folder.createFile(blob);

    var name = cleanText(body.name, 80);
    var note = cleanText(body.note, 1000);

    if (name || note) {
      var meta = {
        fileName: file.getName(),
        uploadedAt: new Date().toISOString(),
        name: name,
        note: note
      };
      var metaBlob = Utilities.newBlob(
        JSON.stringify(meta, null, 2),
        "application/json",
        file.getName() + ".metadata.json"
      );
      folder.createFile(metaBlob);
    }

    return respond({ ok: true, id: file.getId(), name: file.getName() });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function doGet() {
  return respond({ ok: true, app: "wedding-upload-collector" });
}

function sanitizeFileName(name) {
  var cleaned = String(name)
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 180);
  return cleaned || "guest-upload";
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function respond(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
