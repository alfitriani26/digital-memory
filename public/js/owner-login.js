// Halaman masuk / daftar untuk pemilik acara.

let mode = new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login';

const form = $('#form');
const errorBox = $('#error');

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.toggle('hidden', !message);
}

// Mengatur tampilan sesuai mode (Masuk atau Daftar)
function applyMode() {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
  $('#name-field').classList.toggle('hidden', mode === 'login');
  $('#submit').textContent = mode === 'login' ? 'Masuk' : 'Buat akun';
  $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  showError('');
}

$$('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    mode = tab.dataset.mode;
    applyMode();
  })
);

$('#fill-demo').addEventListener('click', () => {
  mode = 'login';
  applyMode();
  $('#email').value = 'demo@digitalmemory.test';
  $('#password').value = 'demo1234';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const name = $('#name').value.trim();

  if (mode === 'register' && !name) return showError('Nama wajib diisi.');
  if (!email || !password) return showError('Email dan password wajib diisi.');

  const button = $('#submit');
  button.disabled = true;
  button.textContent = 'Mohon tunggu...';
  try {
    const body = mode === 'login' ? { email, password } : { name, email, password };
    await api('/api/auth/' + mode, { method: 'POST', json: body });
    location.href = '/owner/dashboard.html';
  } catch (err) {
    showError(err.message);
    button.disabled = false;
    button.textContent = mode === 'login' ? 'Masuk' : 'Buat akun';
  }
});

applyMode();