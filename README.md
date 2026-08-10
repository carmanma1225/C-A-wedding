# Carman & Anthony Wedding Photo Uploader

A small website where wedding guests can select photos and short videos, add
their name and a note, and send everything straight to the Carman & Anthony
Google Drive folder.

The interface is Traditional Chinese by default with an English toggle in the
header. No server or API keys are needed: the site calls a Google Apps Script
web app, which writes each upload into the connected Drive folder.

## Project layout

- `index.html` - the guest-facing page
- `css/styles.css` - page styling
- `js/config.js` - wedding details, language, and Drive connection settings
- `js/i18n.js` - Traditional Chinese and English text
- `js/app.js` - file selection, progress, and upload logic
- `apps-script/Code.gs` - Google Apps Script endpoint that saves files to Drive
- `assets/photos/` - wedding photos used on the page

## 1. Confirm the Google Drive folder

The Drive folder ID in `apps-script/Code.gs` and the album link in
`js/config.js` are already set to:

```text
https://drive.google.com/drive/folders/1c2x4INo6cnXt7BmPD0m6lBkwipHya6qj
```

If you ever change folders, update both the `FOLDER_ID` in `Code.gs` and
`driveFolderUrl` in `js/config.js`.

## 2. Create and deploy the Apps Script web app

1. Open [script.google.com](https://script.google.com) and create a new
   project.
2. Replace the default `Code.gs` with the contents of
   `apps-script/Code.gs`.
3. Click **Deploy > New deployment**.
4. Choose **Web app**, then:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy** and copy the web app URL. It looks like
   `https://script.google.com/macros/s/ABCDEF123456/exec`.

## 3. Connect the website

Open `js/config.js` and set:

```javascript
appsScriptUrl: "PASTE_THE_APPS_SCRIPT_URL_HERE"
```

You can also change `defaultLanguage` between `"zh-Hant"` and `"en"`, and
adjust `maxFileMB` if you want a different upload limit.

## 4. Test locally

Run this command in the project folder:

```powershell
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a browser and try selecting a few files.

## 5. Host it for your guests

The site is fully static, so any static host works:

- **Netlify Drop**: drag the project folder onto app.netlify.com/drop
- **GitHub Pages**: push the repo and enable Pages for the repository
- **Vercel**: import the project and deploy as a static site

## Large video files

Google Apps Script web apps work best with smaller files. The default limit is
25 MB per file; change `maxFileMB` in `js/config.js` if you want a different
value.

For large videos, guests can open the Google Drive album link in the header and
upload directly to the folder instead.

## How uploads are stored

Each file is saved with a timestamp prefix, for example
`20261224-183000_IMG_1234.MOV`. If a guest adds a name or note, a small
`.metadata.json` file is created next to the upload with that information.

Only share the website link with your guests. Anyone who has the link can
upload to the connected folder.
