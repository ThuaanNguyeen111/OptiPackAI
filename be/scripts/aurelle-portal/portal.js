const byId = (id) => document.getElementById(id);
const dialog = byId('create-dialog');
const credentialsDialog = byId('credentials-dialog');
let toastTimer;
function notify(message) {
  byId('toast').textContent = message;
  byId('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { byId('toast').hidden = true; }, 3000);
}
async function copy(value) {
  try { await navigator.clipboard.writeText(value); notify('Đã sao chép vào clipboard'); }
  catch { notify('Không thể sao chép. Hãy chọn và sao chép nội dung thủ công.'); }
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function field(container, label, value, concealed = false) {
  container.append(element('div', 'detail-label', label));
  const row = element('div', 'value-row');
  const code = element('code', '', concealed ? '••••••••••••••••••••••••' : value);
  row.append(code);
  if (concealed) {
    const toggle = element('button', 'copy', 'Hiện');
    toggle.type = 'button';
    toggle.onclick = () => { const hidden = toggle.textContent === 'Hiện'; code.textContent = hidden ? value : '••••••••••••••••••••••••'; toggle.textContent = hidden ? 'Ẩn' : 'Hiện'; };
    row.append(toggle);
  }
  const button = element('button', 'copy', 'Sao chép');
  button.type = 'button';
  button.onclick = () => copy(value);
  row.append(button);
  container.append(row);
}
function openCreate() { byId('form-error').textContent = ''; dialog.showModal(); byId('name').focus(); }
byId('new-app').onclick = openCreate;
byId('close-dialog').onclick = byId('cancel').onclick = () => dialog.close();
byId('close-credentials').onclick = () => credentialsDialog.close();
credentialsDialog.addEventListener('close', () => { byId('credentials').replaceChildren(); byId('env-config').value = ''; });
byId('copy-config').onclick = () => copy(byId('env-config').value);
async function load() {
  const container = byId('apps');
  try {
    const response = await fetch('/developer/api/apps');
    if (!response.ok) throw new Error('Không tải được danh sách ứng dụng.');
    const apps = await response.json();
    container.replaceChildren();
    byId('count').textContent = apps.length;
    if (!apps.length) {
      const empty = element('div', 'empty');
      empty.append(element('div', 'symbol', '◈'), element('h3', '', 'Bắt đầu với ứng dụng đầu tiên'), element('p', '', 'Tạo kết nối cho OptiPack và nhận bộ khóa API của bạn.'));
      const button = element('button', '', '＋ Tạo ứng dụng'); button.onclick = openCreate; empty.append(button); container.append(empty);
    }
    for (const app of apps) {
      const card = element('article', 'app-card');
      card.append(element('span', 'tag', 'Sandbox'), element('h3', '', app.name));
      field(card, 'APP KEY', app.app_key);
      field(card, 'REDIRECT URI', app.redirect_uri);
      card.append(element('small', '', `Tạo ngày ${new Date(app.created_at).toLocaleString('vi-VN')} · App Secret đã được cấp khi tạo.`));
      container.append(card);
    }
  } catch (error) { container.replaceChildren(element('p', '', error.message)); }
}
byId('create-form').onsubmit = async (event) => {
  event.preventDefault();
  const submit = byId('submit'); submit.disabled = true; submit.textContent = 'Đang tạo…'; byId('form-error').textContent = '';
  try {
    const response = await fetch('/developer/api/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: byId('name').value, redirect_uri: byId('callback').value }) });
    const app = await response.json();
    if (!response.ok) throw new Error(app.message || 'Không tạo được ứng dụng.');
    dialog.close();
    byId('credentials').replaceChildren();
    field(byId('credentials'), 'APP KEY', app.app_key);
    field(byId('credentials'), 'APP SECRET', app.app_secret, true);
    field(byId('credentials'), 'REDIRECT URI', app.redirect_uri);
    const port = new URL(app.redirect_uri).port || (app.redirect_uri.startsWith('https:') ? '443' : '80');
    byId('env-config').value = [`PORT=${port}`, `AURELLE_APP_KEY=${app.app_key}`, `AURELLE_APP_SECRET=${app.app_secret}`, `AURELLE_REDIRECT_URI=${app.redirect_uri}`, 'AURELLE_SANDBOX=true', `AURELLE_AUTH_PAGE_BASE_URL=${location.origin}`, `AURELLE_AUTH_API_BASE_URL=${location.origin}/rest`, `AURELLE_API_BASE_URL=${location.origin}/rest`].join('\n');
    credentialsDialog.showModal();
    byId('name').value = '';
    await load();
  } catch (error) { byId('form-error').textContent = error.message; }
  finally { submit.disabled = false; submit.textContent = 'Tạo ứng dụng'; }
};
load();
