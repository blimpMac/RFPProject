/**
 * RFP Desk — Google Apps Script backend
 *
 * Deploy as: Web App → Execute as Me → Who has access: Anyone.
 * Script Properties required:
 *   RFP_SHARED_SECRET = same private secret configured in Netlify
 *   RFP_SITE_URL      = your actual https://...netlify.app URL
 * Optional:
 *   RFP_SUPERVISOR_EMAIL = override address for supervisor testing
 *
 * This script preserves the existing four monitoring sheet tabs.
 */
const SHEET_ID = '1MS8PhbPQA_XbULWAefow4bMsP3s7z-KEp0K9YMJHvTE';
const FOLDER_NAME = 'RFP Desk Secure Attachments';
const TIMEZONE = 'Asia/Manila';

function prop(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function answer(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    const secret = prop('RFP_SHARED_SECRET');

    if (!secret || request.secret !== secret) {
      return answer({ ok: false, error: 'Access denied' });
    }

    const actions = {
      submit: submitRequest,
      review: loadReview,
      decide: recordDecision,
      dashboard: loadDashboard
    };

    if (!actions[request.action]) {
      throw new Error('Unknown action');
    }

    return answer(actions[request.action](request));
  } catch (error) {
    console.error(error.stack || error);
    return answer({ ok: false, error: String(error.message || error) });
  }
}

function tab(name) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  return sheet;
}

function stamp() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'M/d/yyyy HH:mm:ss');
}

function norm(value) {
  return String(value == null ? '' : value).trim().replace(/^\s*-\s*/, '');
}

function rows(sheet) {
  const last = sheet.getLastRow();
  return last > 1
    ? sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getDisplayValues()
    : [];
}

function rowById(id) {
  const sheet = tab('RFP Tracker');
  const data = rows(sheet);

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === id) {
      return { sheet: sheet, number: i + 2, data: data[i] };
    }
  }
  throw new Error('Request not found');
}

function parseLinks(value) {
  return String(value || '')
    .split(/\s*[\n,]\s*/)
    .filter(url => /^https:\/\/drive\.google\.com\//.test(url))
    .map((url, index) => ({
      name: 'Supporting document ' + (index + 1),
      url: url
    }));
}

function mapRow(a) {
  return {
    id: a[0],
    submittedDate: a[1],
    requestorEmail: a[2],
    requestorName: a[3],
    department: norm(a[4]),
    project: a[5],
    rfpType: norm(a[6]),
    payee: a[7],
    purpose: a[8],
    amount: Number(String(a[9] || '0').replace(/[^0-9.-]/g, '')),
    requiredDate: a[10],
    files: parseLinks(a[11]),
    approvingHead: a[12],
    approverEmail: a[13],
    departmentApproval: a[14] || 'Pending',
    departmentApprovalDate: a[15],
    departmentRemarks: a[16],
    financeReview: a[17],
    financeReviewDate: a[18],
    financeRemarks: a[19],
    finalStatus: a[20],
    lastAction: a[21]
  };
}

function nextId() {
  const entries = rows(tab('RFP Tracker'));
  const lastNumber = entries.reduce((largest, item) => {
    const match = String(item[0] || '').match(/^RFP-(\d+)$/);
    return Math.max(largest, match ? Number(match[1]) : 0);
  }, 0);

  return 'RFP-' + String(lastNumber + 1).padStart(4, '0');
}

function activeApprover(department) {
  const list = rows(tab('Approver Master'));
  const match = list.find(item =>
    norm(item[0]).toLowerCase() === norm(department).toLowerCase() &&
    String(item[3]).toLowerCase() === 'yes'
  );

  // Optional private test override; otherwise use Approver Master column C.
  const overrideEmail = prop('RFP_SUPERVISOR_EMAIL').trim();
  const email = overrideEmail || (match ? String(match[2]).trim() : '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      'No supervisor email available. Configure RFP_SUPERVISOR_EMAIL ' +
      'or add an active department approver in Approver Master.'
    );
  }

  return {
    name: match ? String(match[1]) : 'Approving Supervisor',
    email: email
  };
}

function folder() {
  const settings = PropertiesService.getScriptProperties();
  const existingId = settings.getProperty('RFP_FOLDER_ID');

  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (error) {
      console.warn('Saved attachment folder is unavailable: ' + error);
    }
  }

  const created = DriveApp.createFolder(FOLDER_NAME);
  settings.setProperty('RFP_FOLDER_ID', created.getId());
  return created;
}

function validFile(file) {
  return file &&
    typeof file.name === 'string' &&
    typeof file.data === 'string' &&
    /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif|tiff|bmp|x-ms-bmp))$/
      .test(String(file.type || ''));
}

function createFiles(files, requestId) {
  if (!files.length) return { urls: [], blobs: [] };

  const parent = folder();
  const urls = [];
  const blobs = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!validFile(file)) throw new Error('Unsupported file type');

    const bytes = Utilities.base64Decode(file.data);
    const safeName = file.name.replace(/[^\w.\- ]/g, '_').slice(0, 100);
    const blob = Utilities.newBlob(
      bytes,
      file.type,
      requestId + '_' + (i + 1) + '_' + safeName
    );
    const saved = parent.createFile(blob);

    saved.setDescription('Private supporting document for ' + requestId);
    urls.push(saved.getUrl());
    blobs.push(blob);
  }

  return { urls: urls, blobs: blobs };
}

function idToken(id) {
  const payload = Utilities.base64EncodeWebSafe(
    JSON.stringify({ id: id, exp: Date.now() + 14 * 86400000 })
  ).replace(/=+$/, '');

  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, prop('RFP_SHARED_SECRET'))
  ).replace(/=+$/, '');

  return payload + '.' + signature;
}

function esc(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return String(value == null ? '' : value)
    .replace(/[&<>"']/g, character => entities[character]);
}

function emailHtml(title, details, body) {
  return '<div style="font-family:Arial,sans-serif;max-width:660px;' +
    'margin:auto;color:#233a50">' +
    '<div style="background:#173650;color:white;padding:22px 26px;' +
    'border-radius:10px 10px 0 0">' +
    '<strong style="font-size:18px">RFP Desk</strong>' +
    '<p style="margin:5px 0 0;opacity:.85">' + esc(title) + '</p></div>' +
    '<div style="padding:25px;border:1px solid #e4eaf0;' +
    'border-radius:0 0 10px 10px">' +
    details + body +
    '<hr style="border:0;border-top:1px solid #e6edf2;margin:24px 0">' +
    '<small style="color:#8b9ba8">Automated RFP monitoring notification</small>' +
    '</div></div>';
}

function detailHtml(request) {
  return '<p><b>' + esc(request.id) + '</b> • ' +
    esc(request.department) + '</p>' +
    '<p><b>Requestor:</b> ' + esc(request.requestorName) +
    ' (' + esc(request.requestorEmail) + ')</p>' +
    '<p><b>Amount:</b> PHP ' + esc(request.amount) + '</p>' +
    '<p><b>Payee:</b> ' + esc(request.payee) + '</p>' +
    '<p><b>Project:</b> ' + esc(request.project) + '</p>' +
    '<p><b>Purpose:</b> ' + esc(request.purpose) + '</p>' +
    '<p><b>Needed on:</b> ' + esc(request.requiredDate) + '</p>';
}

function logAction(id, action, actor, remarks, previous, next) {
  tab('Approval Log').appendRow([
    stamp(), id, action, actor, remarks || '', previous || '', next
  ]);
}

function submitRequest(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(26000);

  try {
    const r = payload.request || {};
    const files = payload.files || [];

    if (!r.requestorName || !r.requestorEmail || !r.purpose ||
        !r.department || !(Number(r.amount) > 0) ||
        !Array.isArray(files) || files.length > 10) {
      throw new Error('Invalid submission');
    }

    const id = nextId();
    const submitted = stamp();
    const approver = activeApprover(r.department);
    const uploaded = createFiles(files, id);
    const links = uploaded.urls.join('\n');

    // Preserve the 26-column schema in the existing RFP Tracker sheet.
    const tracker = [
      id, submitted, r.requestorEmail, r.requestorName,
      r.department, r.project, r.rfpType, r.payee,
      r.purpose, Number(r.amount), r.requiredDate, links,
      approver.name, approver.email,
      'Pending', '', '', 'Not Started', '', '',
      'Pending Department Approval', 'Submitted', '', '', '', ''
    ];

    tab('RFP Tracker').appendRow(tracker);

    tab('Form Responses 1').appendRow([
      submitted, r.requestorEmail, r.requestorName, r.department,
      r.project, r.rfpType, r.payee, r.purpose,
      Number(r.amount), r.requiredDate, links, approver.name
    ]);

    logAction(
      id, 'Submitted', r.requestorEmail, '',
      '', 'Pending Department Approval'
    );

    const siteUrl = prop('RFP_SITE_URL').replace(/\/+$/, '');
    if (!/^https:\/\//.test(siteUrl)) {
      throw new Error('RFP_SITE_URL is missing or invalid');
    }

    const reviewUrl = siteUrl + '/review/?token=' +
      encodeURIComponent(idToken(id));

    const summary = mapRow(tracker);
    let notificationWarning = false;

    try {
      let previews = '<h3>Supporting documents</h3>';
      const inlineImages = {};

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const blob = uploaded.blobs[i];

        const supportsInline = /^image\/(jpeg|png|gif)$/.test(file.type) &&
          blob.getBytes().length < 1500000;

        if (supportsInline) {
          inlineImages['preview' + i] = blob;
          previews += '<p><b>' + esc(file.name) + '</b></p>' +
            '<img src="cid:preview' + i + '" style="max-width:100%;' +
            'max-height:300px;object-fit:contain;border-radius:7px">';
        } else {
          previews += '<p>Attachment: ' + esc(file.name) + '</p>';
        }
      }

      const button = '<p style="margin-top:26px">' +
        '<a href="' + esc(reviewUrl) + '" style="background:#173650;' +
        'color:#fff;text-decoration:none;padding:13px 19px;' +
        'border-radius:7px">Review / approve / reject request</a></p>';

      const note = '<small>Opening this email does not approve the ' +
        'request. Decisions are confirmed on the website.</small>';

      GmailApp.sendEmail(
        approver.email,
        'RFP approval needed - ' + id,
        'Review request: ' + reviewUrl,
        {
          name: 'RFP Desk',
          htmlBody: emailHtml(
            'New request awaiting approval',
            detailHtml(summary),
            previews + button + note
          ),
          attachments: uploaded.blobs,
          inlineImages: inlineImages
        }
      );
    } catch (error) {
      console.error('Supervisor email failed for ' + id + ': ' + error);
      notificationWarning = true;
    }

    return { ok: true, id: id, notificationWarning: notificationWarning };
  } finally {
    lock.releaseLock();
  }
}

function loadReview(payload) {
  return {
    ok: true,
    request: mapRow(rowById(payload.id).data)
  };
}

function recordDecision(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(26000);

  try {
    const found = rowById(payload.id);
    const sheet = found.sheet;
    const request = mapRow(found.data);

    if (request.departmentApproval !== 'Pending') {
      throw new Error('This request has already been reviewed');
    }

    const approved = payload.decision === 'approve';
    const remarks = String(payload.remarks || '').trim();

    if (!approved && !remarks) {
      throw new Error('Rejection remarks required');
    }

    const next = approved
      ? 'Pending Finance Review'
      : 'Rejected by Department';

    const status = approved ? 'Approved' : 'Rejected';
    const action = approved
      ? 'Department Approved'
      : 'Department Rejected';

    sheet.getRange(found.number, 15, 1, 3).setValues([
      [status, stamp(), remarks]
    ]);

    sheet.getRange(found.number, 21, 1, 2).setValues([
      [next, action]
    ]);

    logAction(
      payload.id, action, request.approverEmail,
      remarks, 'Pending Department Approval', next
    );

    let notificationWarning = false;

    try {
      const message = approved
        ? 'Your request is approved, please wait for further instructions'
        : 'Your request is not approved, please provide documentation or clarify your reason.';

      GmailApp.sendEmail(
        request.requestorEmail,
        'RFP ' + payload.id + ' - ' + status,
        message,
        {
          name: 'RFP Desk',
          htmlBody: emailHtml(
            'Request status update',
            detailHtml(request),
            '<h3>' + esc(message) + '</h3><p>' + esc(remarks) + '</p>'
          )
        }
      );
    } catch (error) {
      console.error('Requestor email failed: ' + error);
      notificationWarning = true;
    }

    return {
      ok: true,
      notificationWarning: notificationWarning,
      message: approved
        ? 'Department approval recorded. Finance review is the next step.'
        : 'Request rejection recorded.'
    };
  } finally {
    lock.releaseLock();
  }
}

function loadDashboard() {
  const data = rows(tab('RFP Tracker'));
  return {
    ok: true,
    requests: data
      .filter(item => /^RFP-\d+/.test(item[0]))
      .map(mapRow)
  };
}

/**
 * Supervisor notifications use the active Approver Master email by default.
 * Optionally set RFP_SUPERVISOR_EMAIL in Script Properties for pilot testing.
 *
 * No supervisor or administrator address is stored in public code.
 * The existing sheet tabs and previous rows are never deleted or replaced.
 */